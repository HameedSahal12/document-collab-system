📄 Document Collaboration System

A real-time cloud-based collaborative document editing platform built using React, Flask, MongoDB, JWT, and Socket.IO.

🚀 Overview

The Document Collaboration System enables multiple team members to create, edit, upload, and collaborate on text documents in real time.

It includes an intelligent analytics dashboard, dark/light mode UI, secure authentication, team management, file uploads (DOCX/PDF), and a rich text editor powered by TipTap.

This project demonstrates full-stack development across:
✔ Frontend (React)
✔ Backend (Flask + MongoDB + JWT)
✔ WebSockets (Socket.IO)
✔ Analytics & Visualization
✔ Responsive UI with Light/Dark Themes
✔ User & Team Management

✨ Key Features
📝 1. Real-time Collaborative Editing

Multiple users can edit a document simultaneously.

Updates sync instantly using Socket.IO.

Rich text formatting with TipTap (Bold, Italic, Headings, Lists, etc.)

📤 2. Document Uploads

Upload DOCX and PDF files.

Parse and edit uploaded text directly in the editor.

📊 3. User Analytics Dashboard

Tracks each user’s:

Words added

Edits made

Productivity score

Displays performance using circular charts & graphs.

🔐 4. Secure Authentication

Login & Signup protected via JWT Authentication

Session handling via secure tokens

👥 5. Team Management

Add new team members

View existing members

Remove members

All managed through the Settings page

🎨 6. Light / Dark Mode

Modern UI with theme switch

Smooth transitions

All pages theme-aware (Editor, Dashboard, Analytics)

📁 7. Organized Folder Structure

Clean separation between frontend (document-collab-frontend) and backend (document-collab-backend)

🏗️ Technology Stack
Frontend

React.js

React Router

TipTap Rich Text Editor

Axios

Custom Light/Dark Theme System

Backend

Flask

Flask-JWT-Extended

Flask-CORS

Flask-SocketIO

MongoDB (PyMongo)

Other Tools

Socket.IO for live editing

Dockerfile included for backend containerization

Git & GitHub version control

📂 Project Structure
document-collab-system/
│
├── document-collab-frontend/      # React frontend
│   ├── src/
│   ├── public/
│   └── package.json
│
├── document-collab-backend/       # Flask backend
│   ├── app.py
│   ├── uploads/
│   ├── requirements.txt
│   └── Dockerfile
│
├── .gitignore
└── README.md

🔧 Setup Instructions
1️⃣ Clone the repository
git clone https://github.com/HameedSahal12/document-collab-system.git
cd document-collab-system

⚙️ Backend Setup (Flask)
2️⃣ Create a virtual environment
cd document-collab-backend
python -m venv venv
venv\Scripts\activate   # Windows

3️⃣ Install dependencies
pip install -r requirements.txt

4️⃣ Start the backend
python app.py


Backend will run on:

http://localhost:5050

💻 Frontend Setup (React)
5️⃣ Install frontend dependencies
cd ../document-collab-frontend
npm install

6️⃣ Start the development server
npm start


Frontend will run on:

http://localhost:3000

🧪 Testing the Platform

Create an account / login

Create or upload a new document

Open the same document in multiple browsers to test real-time sync

Check analytics for activity tracking

Add or remove team members in Settings

Switch between light/dark themes

📦 Deployment (Optional)

The project includes:

Dockerfile for backend

Production build support for frontend

Can be deployed on AWS, GCP, or Render

If you want full deployment instructions, tell me "Generate deployment guide".

🤝 Contributing

Pull requests are welcome.
For major changes, open an issue first to discuss what you would like to improve.

📜 License

This project currently has no license.
If you want to make it open-source, I can add MIT License — just say “Add MIT License”.

⭐ Support the Project

If you found this project useful, consider giving it a star ⭐ on GitHub—it helps a lot!

https://github.com/HameedSahal12/document-collab-system
