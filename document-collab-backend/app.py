from flask import Flask, request, jsonify
from flask_socketio import SocketIO
from flask_socketio import join_room, leave_room, emit
from flask_cors import CORS
from flask_pymongo import PyMongo
from bson.objectid import ObjectId
from bson.errors import InvalidId
from datetime import datetime, timezone, timedelta
import os
from os import getenv
from flask_jwt_extended import (
    JWTManager, create_access_token, create_refresh_token,
    jwt_required, get_jwt_identity, decode_token
)
from flask_bcrypt import Bcrypt
from sumy.parsers.plaintext import PlaintextParser
from sumy.nlp.tokenizers import Tokenizer
from sumy.summarizers.text_rank import TextRankSummarizer
import re
from werkzeug.utils import secure_filename
import nltk
from collections import defaultdict

# Try to load environment variables from a .env file if available
try:
    from dotenv import load_dotenv  # type: ignore
    load_dotenv()
except Exception:
    pass

# -----------------------------------------
# INITIAL SETUP
# -----------------------------------------
app = Flask(__name__)
CORS(app, supports_credentials=True)

app.config["MONGO_URI"] = getenv("MONGO_URI", "mongodb://localhost:27017/document_collab")
mongo = PyMongo(app)

app.config['SECRET_KEY'] = getenv('SECRET_KEY', 'supersecretkey')
app.config['JWT_SECRET_KEY'] = getenv('JWT_SECRET_KEY', 'supersecurejwtkey')
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(hours=int(getenv('JWT_ACCESS_HOURS', '2')))
app.config['JWT_REFRESH_TOKEN_EXPIRES'] = timedelta(days=int(getenv('JWT_REFRESH_DAYS', '7')))

socketio = SocketIO(app, cors_allowed_origins="*")
jwt = JWTManager(app)
bcrypt = Bcrypt(app)

# ---------- helpers ----------
def dt_to_iso(dt):
    return dt.isoformat() if isinstance(dt, datetime) else dt

def serialize_doc(doc):
    return {
        "id": str(doc["_id"]),
        "title": doc.get("title", ""),
        "content": doc.get("content", ""),
        "updated_at": dt_to_iso(doc.get("updated_at")),
        "created_at": dt_to_iso(doc.get("created_at")),
        "owner_email": doc.get("owner_email"),
    }


# ---------- summarization helper ----------
def _ensure_punkt():
    """Ensure NLTK punkt resources are available (punkt + punkt_tab for NLTK>=3.8)."""
    for pkg in ("punkt", "punkt_tab"):
        try:
            nltk.data.find(f'tokenizers/{pkg}')
        except LookupError:
            try:
                nltk.download(pkg)
            except Exception:
                pass


def summarize_text(text: str, style: str = "short") -> str:
    style = (style or "short").lower()
    if style not in {"short", "medium", "bullets"}:
        style = "short"

    _ensure_punkt()

    def simple_split(s: str):
        parts = re.split(r"(?<=[.!?])\s+", (s or "").strip())
        return [p.strip() for p in parts if p.strip()]

    try:
        parser = PlaintextParser.from_string(text, Tokenizer("english"))
        summarizer = TextRankSummarizer()

        if style == "short":
            count = 2
        elif style == "medium":
            count = 4
        else:
            count = 4

        sentences = list(summarizer(parser.document, sentences_count=count))
        chunks = [str(s).strip() for s in sentences if str(s).strip()]
        if not chunks:
            chunks = simple_split(text)[:count]
    except Exception as e:
        # Fallback: naive sentence split if TextRank/NLTK fails
        print("Summarizer fallback due to error:", e)
        if style == "short":
            count = 2
        elif style == "medium":
            count = 4
        else:
            count = 4
        chunks = simple_split(text)[:count]

    if not chunks:
        return text.strip()

    if style == "bullets":
        return "\n".join(f"- {s}" for s in chunks)
    else:
        return " ".join(chunks)

# -----------------------------------------
# SIGNUP
# -----------------------------------------
@app.route("/signup", methods=["POST"])
def signup():
    email = request.form.get("email")
    password = request.form.get("password")
    usernames = request.form.getlist("usernames[]")

    if not (email and password and usernames):
        return jsonify({"error": "Missing required fields"}), 400

    if mongo.db.teams.find_one({"email": email}):
        return jsonify({"error": "Team with this email already exists"}), 409

    hashed_pw = bcrypt.generate_password_hash(password).decode("utf-8")
    mongo.db.teams.insert_one({
        "email": email,
        "password": hashed_pw,
        "usernames": usernames,
        "created_at": datetime.now(timezone.utc)
    })
    return jsonify({"message": "Team registered successfully"}), 201

# -----------------------------------------
# LOGIN
# -----------------------------------------
@app.route("/login", methods=["POST"])
def login():
    data = request.get_json()
    email, username, password = data.get("email"), data.get("username"), data.get("password")

    team = mongo.db.teams.find_one({"email": email})
    if not team or username not in team.get("usernames", []):
        return jsonify({"error": "Invalid credentials"}), 401
    if not bcrypt.check_password_hash(team["password"], password):
        return jsonify({"error": "Invalid credentials"}), 401

    access_token = create_access_token(identity=email)
    refresh_token = create_refresh_token(identity=email)

    return jsonify({
        "access_token": access_token,
        "refresh_token": refresh_token
    }), 200

# -----------------------------------------
# REFRESH TOKEN
# -----------------------------------------
@app.route("/refresh", methods=["POST"])
def refresh():
    data = request.get_json()
    token = data.get("refresh_token")
    if not token:
        return jsonify({"error": "Missing refresh token"}), 400

    try:
        decoded = decode_token(token)
        if decoded.get("type") != "refresh":
            return jsonify({"error": "Invalid token type"}), 401
        email = decoded.get("sub")
        new_token = create_access_token(identity=email)
        return jsonify({"access_token": new_token}), 200
    except Exception:
        return jsonify({"error": "Invalid or expired refresh token"}), 401

# -----------------------------------------
# GET DOCUMENTS
# -----------------------------------------
@app.route("/documents", methods=["GET"])
@jwt_required()
def get_documents():
    email = get_jwt_identity()
    docs = list(mongo.db.documents.find({"owner_email": email}))
    return jsonify([
        {
            "id": str(d["_id"]),
            "title": d.get("title", ""),
            "updated_at": dt_to_iso(d.get("updated_at"))
        } for d in docs
    ]), 200

# -----------------------------------------
# CREATE DOCUMENT
# -----------------------------------------
@app.route("/documents", methods=["POST"])
@jwt_required()
def create_document():
    try:
        email = get_jwt_identity()
        data = request.get_json(force=True, silent=True)
        if not data or not data.get("title"):
            return jsonify({"error": "Missing title"}), 400

        now = datetime.now(timezone.utc)
        doc = {
            "title": data["title"].strip(),
            "content": "",
            "owner_email": email,
            "created_at": now,
            "updated_at": now
        }
        result = mongo.db.documents.insert_one(doc)
        return jsonify({"id": str(result.inserted_id), "title": doc["title"]}), 201
    except Exception as e:
        print("❌ Error creating doc:", e)
        return jsonify({"error": "Server error"}), 500

# -----------------------------------------
# GET DOCUMENT (open in editor)
# -----------------------------------------
@app.route("/documents/<doc_id>", methods=["GET"])
@jwt_required()
def get_document(doc_id):
    try:
        email = get_jwt_identity()
        try:
            oid = ObjectId(doc_id)
        except (InvalidId, TypeError):
            return jsonify({"error": "Invalid document id"}), 400

        doc = mongo.db.documents.find_one({"_id": oid, "owner_email": email})
        if not doc:
            return jsonify({"error": "Document not found"}), 404
        return jsonify(serialize_doc(doc)), 200
    except Exception as e:
        print("❌ Error fetching document:", e)
        return jsonify({"error": "Failed to load document"}), 500

# -----------------------------------------
# UPDATE DOCUMENT
# -----------------------------------------
@app.route("/documents/<doc_id>", methods=["POST"])
@jwt_required()
def update_document(doc_id):
    try:
        email = get_jwt_identity()
        # Accept JSON or form, but never silently replace with empty content
        data = request.get_json(silent=True)
        if data is None or not isinstance(data, dict):
            data = request.form.to_dict() if request.form else {}
        if "content" not in data:
            return jsonify({"error": "Missing content"}), 400
        content = data.get("content", "")
        username = data.get("username") or request.headers.get("X-Username") or email

        try:
            oid = ObjectId(doc_id)
        except (InvalidId, TypeError):
            return jsonify({"error": "Invalid document id"}), 400

        # Fetch current doc to compute words delta
        doc = mongo.db.documents.find_one({"_id": oid, "owner_email": email})
        if not doc:
            return jsonify({"error": "Document not found"}), 404

        def word_count(txt):
            try:
                return len((txt or "").split())
            except Exception:
                return 0

        old_wc = word_count(doc.get("content", ""))
        new_wc = word_count(content)
        words_added = max(0, new_wc - old_wc)

        mongo.db.documents.update_one(
            {"_id": oid, "owner_email": email},
            {"$set": {"content": content, "updated_at": datetime.now(timezone.utc)}}
        )

        # Write activity log (best-effort)
        try:
            mongo.db.activity_logs.insert_one({
                "doc_id": str(oid),
                "user_email": username,
                "action": "update",
                "timestamp": datetime.now(timezone.utc),
                "words_added": int(words_added),
            })
        except Exception as log_err:
            print("Analytics log error:", log_err)
        return jsonify({"message": "Document updated"}), 200
    except Exception as e:
        print("❌ Update error:", e)
        return jsonify({"error": "Server error"}), 500

# -----------------------------------------
# ANALYTICS (team-level)
# -----------------------------------------
@app.route("/analytics", methods=["GET"])
@jwt_required()
def get_analytics():
    """Compute intelligent analytics from activity_logs for the team.

    Returns a payload compatible with the existing frontend (user_contributions,
    collaboration_timeline, badges, anomalies) and also a richer structure
    (contributors, collaboration_heatmap, hourly_activity, alerts,
    collaboration_matrix) for future use.
    """
    try:
        team_email = get_jwt_identity()

        # Get this team's document IDs (as strings to match logs)
        team_docs = list(
            mongo.db.documents.find({"owner_email": team_email}, {"_id": 1})
        )
        doc_ids = [str(d["_id"]) for d in team_docs]
        if not doc_ids:
            return "", 204

        # Fetch all activity logs for those docs
        logs = list(mongo.db.activity_logs.find({"doc_id": {"$in": doc_ids}}))
        if not logs:
            return "", 204

        # Helpers
        def parse_ts(ts):
            if isinstance(ts, datetime):
                # Assume UTC if naive
                return ts if ts.tzinfo else ts.replace(tzinfo=timezone.utc)
            if isinstance(ts, str):
                try:
                    # Support trailing Z and offset strings
                    s = ts.replace("Z", "+00:00")
                    return datetime.fromisoformat(s)
                except Exception:
                    return None
            return None

        # Aggregations
        per_user = {}
        hourly_counts = defaultdict(int)  # 0..23
        weekday_counts = defaultdict(int)  # 0..6 (Mon..Sun)
        # 7x24 matrix for heatmap [weekday][hour]
        matrix = [[0 for _ in range(24)] for _ in range(7)]

        last_activity_ts = None

        for lg in logs:
            u = lg.get("user_email") or "unknown"
            if u not in per_user:
                per_user[u] = {
                    "total_edits": 0,
                    "total_words": 0,
                    "docs": set(),
                    "hours": [0] * 24,
                    "badges": [],
                }

            per_user[u]["total_edits"] += 1
            per_user[u]["total_words"] += int(lg.get("words_added", 0) or 0)
            if lg.get("doc_id"):
                per_user[u]["docs"].add(str(lg.get("doc_id")))

            ts = parse_ts(lg.get("timestamp"))
            if ts:
                # Normalize to UTC for hour/weekday
                if ts.tzinfo is None:
                    ts = ts.replace(tzinfo=timezone.utc)
                ts_utc = ts.astimezone(timezone.utc)
                hr = ts_utc.hour
                wd = ts_utc.weekday()  # 0=Mon
                hourly_counts[hr] += 1
                weekday_counts[wd] += 1
                matrix[wd][hr] += 1
                per_user[u]["hours"][hr] += 1

                if last_activity_ts is None or ts > last_activity_ts:
                    last_activity_ts = ts

        # Determine badges
        # Top Contributor (highest total words)
        top_user = None
        if per_user:
            top_user = max(per_user.items(), key=lambda kv: kv[1]["total_words"])[0]
            per_user[top_user]["badges"].append("Top Contributor")

        # Early Bird: majority of edits between 5–9 AM
        # Night Owl: majority between 9 PM–2 AM
        for u, stats in per_user.items():
            total_events = sum(stats["hours"]) or 0
            if total_events:
                early_sum = sum(stats["hours"][5:10])  # 5..9
                night_sum = sum(stats["hours"][21:24]) + sum(stats["hours"][0:3])  # 21..23 + 0..2
                if early_sum / total_events >= 0.5:
                    stats["badges"].append("Early Bird")
                if night_sum / total_events >= 0.5:
                    stats["badges"].append("Night Owl")

            # Team Player: contributed in >= 3 different docs
            if len(stats["docs"]) >= 3:
                stats["badges"].append("Team Player")

        # Build outputs
        # Contributors detailed view
        contributors = []
        for u, stats in per_user.items():
            contributors.append({
                "user_email": u,
                "username": u,  # alias for current UI
                "total_words": stats["total_words"],
                "total_edits": stats["total_edits"],
                "badges": stats["badges"],
            })

        # Sort top contributors by words
        contributors.sort(key=lambda x: x["total_words"], reverse=True)

        # Back-compat structures for existing UI
        user_contributions = [
            {
                "username": c["username"],
                "edits": c["total_edits"],
                "words_added": c["total_words"],
            }
            for c in contributors
        ]

        collaboration_timeline = [
            {"hour": h, "activity": hourly_counts.get(h, 0)} for h in range(24)
        ]

        # Day-of-week map
        dow_labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        collaboration_heatmap = {
            dow_labels[i]: weekday_counts.get(i, 0) for i in range(7)
        }
        hourly_activity = {str(h): hourly_counts.get(h, 0) for h in range(24)}

        # Badges as list items for UI badges panel
        badges = []
        for c in contributors:
            for b in c["badges"]:
                badges.append({"username": c["username"], "title": b})

        # Alerts / anomalies
        alerts = []
        anomalies = []
        now = datetime.now(timezone.utc)
        if last_activity_ts is None or (now - last_activity_ts) > timedelta(hours=24):
            msg = "No edits from team in last 24 hours"
            alerts.append(msg)
            anomalies.append({"message": msg})
        if last_activity_ts is None or (now - last_activity_ts) > timedelta(days=3):
            msg = "No edits from team in last 3 days"
            alerts.append(msg)
            anomalies.append({"message": msg})

        payload = {
            # Rich structure
            "contributors": contributors,
            "collaboration_heatmap": collaboration_heatmap,
            "hourly_activity": hourly_activity,
            "alerts": alerts,
            # Back-compat for existing UI
            "user_contributions": user_contributions,
            "collaboration_timeline": collaboration_timeline,
            "badges": badges,
            "anomalies": anomalies,
            # Heatmap matrix for days x hours (optional advanced UI)
            "collaboration_matrix": {
                "days": dow_labels,
                "hours": list(range(24)),
                "counts": matrix,
            },
        }

        return jsonify(payload), 200
    except Exception as e:
        print("Analytics error:", e)
        return jsonify({"error": "Failed to compute analytics"}), 500

# -----------------------------------------
# ANALYTICS RESET (delete team activity logs)
# -----------------------------------------
@app.route("/analytics/reset", methods=["POST"])
@jwt_required()
def reset_analytics():
    try:
        team_email = get_jwt_identity()
        team_docs = list(mongo.db.documents.find({"owner_email": team_email}, {"_id": 1}))
        doc_ids = [str(d["_id"]) for d in team_docs]
        if not doc_ids:
            return jsonify({"deleted": 0}), 200
        res = mongo.db.activity_logs.delete_many({"doc_id": {"$in": doc_ids}})
        return jsonify({"deleted": int(res.deleted_count)}), 200
    except Exception as e:
        print("Reset analytics error:", e)
        return jsonify({"error": "Failed to reset analytics"}), 500

# -----------------------------------------
# UPLOAD DOC/.DOCX -> create document
# -----------------------------------------
@app.route('/upload_doc', methods=['POST'])
@jwt_required()
def upload_doc():
    try:
        try:
            from docx import Document as DocxDocument
        except Exception:
            return jsonify({
                "error": "python-docx is not installed. Run: pip install python-docx"
            }), 500
        import tempfile
        user = get_jwt_identity()
        if not user:
            return jsonify({"error": "Unauthorized"}), 401

        if 'file' not in request.files:
            return jsonify({"error": "No file uploaded"}), 400
        file = request.files['file']
        if not file or not getattr(file, 'filename', ''):
            return jsonify({"error": "No file uploaded"}), 400

        filename = secure_filename(file.filename)
        if not filename.lower().endswith(('.docx',)):
            return jsonify({"error": "Only .docx files are supported"}), 400

        # Note: python-docx supports .docx only.

        # Save to a secure temp path
        with tempfile.NamedTemporaryFile(delete=False, suffix='.docx') as tmp:
            temp_path = tmp.name
            file.save(temp_path)

        # Extract text
        try:
            d = DocxDocument(temp_path)
            text = "\n".join([p.text for p in d.paragraphs])
        except Exception as e:
            return jsonify({"error": f"Error reading .docx file: {e}"}), 500
        finally:
            try:
                os.remove(temp_path)
            except Exception:
                pass

        now = datetime.now(timezone.utc)
        new_doc = {
            "title": os.path.splitext(filename)[0],
            "content": text or "",
            "owner_email": user,
            "created_at": now,
            "updated_at": now,
        }
        ins = mongo.db.documents.insert_one(new_doc)
        return jsonify({"message": "File uploaded", "doc_id": str(ins.inserted_id)}), 200
    except Exception as e:
        print("Upload doc error:", e)
        return jsonify({"error": f"Failed to upload document: {e}"}), 500

# -----------------------------------------
# DELETE DOCUMENT
# -----------------------------------------
@app.route("/documents/<doc_id>", methods=["DELETE"])
@jwt_required()
def delete_document(doc_id):
    try:
        email = get_jwt_identity()
        try:
            oid = ObjectId(doc_id)
        except (InvalidId, TypeError):
            return jsonify({"error": "Invalid document id"}), 400

        # Only allow deleting documents owned by the current team
        res = mongo.db.documents.delete_one({"_id": oid, "owner_email": email})
        if res.deleted_count == 0:
            return jsonify({"error": "Document not found"}), 404

        # Best-effort: remove activity logs for this document
        try:
            mongo.db.activity_logs.delete_many({"doc_id": str(oid)})
        except Exception as log_err:
            print("Delete logs error:", log_err)

        return jsonify({"message": "Document deleted"}), 200
    except Exception as e:
        print("Delete document error:", e)
        return jsonify({"error": "Failed to delete document"}), 500

# -----------------------------------------
# SUMMARIZE (TextRank)
# -----------------------------------------
@app.route("/summarize", methods=["POST"])
@jwt_required()
def summarize_route():
    try:
        data = request.get_json(silent=True) or {}
        text = (data.get("text") or "").strip()
        style = (data.get("style") or "short").strip().lower()

        if not text:
            return jsonify({"error": "Missing text"}), 400

        summary = summarize_text(text, style)
        return jsonify({"summary": summary}), 200
    except Exception as e:
        print("Summarize error:", e)
        return jsonify({"error": "Failed to summarize"}), 500

# -----------------------------------------
# CHANGE PASSWORD
# -----------------------------------------
@app.route("/change_password", methods=["POST"])
@jwt_required()
def change_password():
    try:
        identity_email = (get_jwt_identity() or "").strip().lower()
        data = request.get_json(silent=True) or {}
        email = (data.get("email") or "").strip().lower()
        current_password = data.get("current_password")
        new_password = data.get("new_password")

        if not (email and current_password and new_password):
            return jsonify({"error": "Missing required fields"}), 400
        if identity_email != email:
            return jsonify({"error": "Email mismatch"}), 403

        team = mongo.db.teams.find_one({"email": email})
        if not team:
            return jsonify({"error": "Account not found"}), 404
        if not bcrypt.check_password_hash(team.get("password", ""), current_password):
            return jsonify({"error": "Current password is incorrect"}), 401

        hashed_new = bcrypt.generate_password_hash(new_password).decode("utf-8")
        mongo.db.teams.update_one(
            {"_id": team["_id"]},
            {"$set": {"password": hashed_new, "updated_at": datetime.now(timezone.utc)}}
        )
        return jsonify({"message": "Password updated successfully"}), 200
    except Exception as e:
        print("Change password error:", e)
        return jsonify({"error": "Failed to update password"}), 500

# -----------------------------------------
# ADD TEAM MEMBER
# -----------------------------------------
@app.route("/add_member", methods=["POST"])
@jwt_required()
def add_member():
    try:
        team_email = (get_jwt_identity() or "").strip().lower()
        data = request.get_json(silent=True) or {}
        new_member = (data.get("new_member") or "").strip()
        payload_email = (data.get("email") or "").strip().lower()

        if not new_member:
            return jsonify({"error": "Missing new member username"}), 400
        if payload_email and payload_email != team_email:
            return jsonify({"error": "Email mismatch"}), 403

        team = mongo.db.teams.find_one({"email": team_email})
        if not team:
            return jsonify({"error": "Account not found"}), 404

        usernames = team.get("usernames") or []
        if new_member in usernames:
            return jsonify({"error": "Member already exists"}), 409

        usernames.append(new_member)
        mongo.db.teams.update_one({"_id": team["_id"]}, {"$set": {"usernames": usernames}})
        return jsonify({"message": "Member added successfully"}), 200
    except Exception as e:
        print("Add member error:", e)
        return jsonify({"error": "Failed to add member"}), 500

# -----------------------------------------
# GET TEAM MEMBERS
# -----------------------------------------
@app.route("/team_members", methods=["GET"])
@jwt_required()
def team_members():
    try:
        team_email = (get_jwt_identity() or "").strip().lower()
        team = mongo.db.teams.find_one({"email": team_email})
        if not team:
            return jsonify({"error": "Account not found"}), 404
        return jsonify({"members": team.get("usernames", [])}), 200
    except Exception as e:
        print("Team members error:", e)
        return jsonify({"error": "Failed to fetch members"}), 500

# -----------------------------------------
# REMOVE TEAM MEMBER
# -----------------------------------------
@app.route("/remove_member", methods=["POST"])
@jwt_required()
def remove_member():
    try:
        team_email = (get_jwt_identity() or "").strip().lower()
        data = request.get_json(silent=True) or {}
        member = (data.get("member") or "").strip()
        payload_email = (data.get("email") or "").strip().lower()

        if not member:
            return jsonify({"error": "Missing member username"}), 400
        if payload_email and payload_email != team_email:
            return jsonify({"error": "Email mismatch"}), 403

        team = mongo.db.teams.find_one({"email": team_email})
        if not team:
            return jsonify({"error": "Account not found"}), 404

        usernames = team.get("usernames") or []
        if member not in usernames:
            return jsonify({"error": "Member not found"}), 404
        if len(usernames) <= 1:
            return jsonify({"error": "Cannot remove the last member"}), 400

        usernames = [u for u in usernames if u != member]
        mongo.db.teams.update_one({"_id": team["_id"]}, {"$set": {"usernames": usernames}})
        return jsonify({"message": "Member removed successfully"}), 200
    except Exception as e:
        print("Remove member error:", e)
        return jsonify({"error": "Failed to remove member"}), 500

# -----------------------------------------
# DELETE ACCOUNT (team-wide)
# -----------------------------------------
@app.route("/delete_account", methods=["DELETE"])
@jwt_required()
def delete_account():
    try:
        email = get_jwt_identity()
        if not email:
            return jsonify({"error": "Unauthorized"}), 401

        # Collect this team's documents
        team_docs = list(mongo.db.documents.find({"owner_email": email}, {"_id": 1}))
        doc_ids = [str(d["_id"]) for d in team_docs]

        # Delete activity logs for those documents
        if doc_ids:
            try:
                mongo.db.activity_logs.delete_many({"doc_id": {"$in": doc_ids}})
            except Exception as e:
                print("Delete account (logs) error:", e)

        # Delete documents
        try:
            mongo.db.documents.delete_many({"owner_email": email})
        except Exception as e:
            print("Delete account (docs) error:", e)

        # Delete team entry
        try:
            mongo.db.teams.delete_one({"email": email})
        except Exception as e:
            print("Delete account (team) error:", e)

        return jsonify({"message": "Account and associated data deleted"}), 200
    except Exception as e:
        print("Delete account error:", e)
        return jsonify({"error": "Failed to delete account"}), 500

# -----------------------------------------
# SOCKET EVENTS
# -----------------------------------------

@socketio.on("join_doc")
def on_join_doc(data):
    try:
        doc_id = (data or {}).get("doc_id")
        user = (data or {}).get("user")
        if not doc_id:
            return
        join_room(doc_id)
        emit("presence", {"event": "join", "user": user}, to=doc_id, include_self=False)
    except Exception as e:
        print("join_doc error:", e)

@socketio.on("leave_doc")
def on_leave_doc(data):
    try:
        doc_id = (data or {}).get("doc_id")
        user = (data or {}).get("user")
        if not doc_id:
            return
        leave_room(doc_id)
        emit("presence", {"event": "leave", "user": user}, to=doc_id, include_self=False)
    except Exception as e:
        print("leave_doc error:", e)

@socketio.on("doc_change")
def on_doc_change(data):
    """Broadcast document content changes to other clients in the room.
    Expected payload: { doc_id, content, client_id }
    """
    try:
        doc_id = (data or {}).get("doc_id")
        content = (data or {}).get("content", "")
        client_id = (data or {}).get("client_id")
        if not doc_id:
            return
        emit("doc_update", {"content": content, "client_id": client_id}, to=doc_id, include_self=False)
    except Exception as e:
        print("doc_change error:", e)

@socketio.on("connect")
def on_connect():
    print("Client connected ✅")

@socketio.on("disconnect")
def on_disconnect():
    print("Client disconnected ❌")

# -----------------------------------------
# MAIN
# -----------------------------------------
if __name__ == "__main__":
    # Bind host/port from env for flexibility
    host = getenv("HOST", "127.0.0.1")
    try:
        port = int(getenv("PORT", "5050"))
    except Exception:
        port = 5050
    socketio.run(app, debug=True, allow_unsafe_werkzeug=True, host=host, port=port, use_reloader=False)
