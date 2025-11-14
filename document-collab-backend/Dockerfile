# Step 1: Use a lightweight Python image
FROM python:3.10-slim

# Step 2: Set working directory inside the container
WORKDIR /app

# Step 3: Copy everything from this folder into the container
COPY . .

# Step 4: Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Step 5: Expose the backend port
EXPOSE 5050

# Step 6: Start the Flask app
CMD ["python", "app.py"]
