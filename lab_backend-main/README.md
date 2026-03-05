# AI Diagnostic Backend

A Python backend application built with FastAPI and MongoDB.

## Features

- FastAPI framework for high-performance API
- MongoDB database connection using Motor (async driver)
- Environment-based configuration
- Health check endpoints
- CORS middleware support

## Prerequisites

- Python 3.8 and + 
- MongoDB (local or remote instance)

## Installation

1. Clone the repository
2. Create a virtual environment:
   ```bash
   python -m venv venv
   ```

3. Activate the virtual environment:
   - Windows:
     ```bash
     venv\Scripts\activate
     ```
   - Linux/Mac:
     ```bash
     source venv/bin/activate
     ```

4. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

5. Create a `.env` file from the example:
   ```bash
   cp .env.example .env
   ```

6. Update the `.env` file with your MongoDB connection string and other settings.

## Running the Application

Start the development server:
```bash
python main.py
```

Or using uvicorn directly:
```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at `http://localhost:8000`

## API Endpoints

- `GET /` - Root endpoint with API information
- `GET /health` - Health check endpoint

## API Documentation

Once the server is running, you can access:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## MongoDB Connection

The application uses Motor (async MongoDB driver) for database operations. Make sure your MongoDB instance is running and accessible at the connection string specified in your `.env` file.

## Project Structure

```
.
├── main.py              # FastAPI application entry point
├── database.py          # MongoDB connection management
├── config.py            # Application configuration
├── requirements.txt     # Python dependencies
├── .env.example         # Environment variables template
└── README.md           # This file
```

## Development

To add new features:
1. Create new route handlers in `main.py` or separate router files
2. Use `get_database()` from `database.py` to access the database
3. Follow FastAPI best practices for async operations

#
