"""
LOE Validator API - FastAPI Backend

Provides REST API endpoints for SOW/LOE document validation,
integrating with the existing sow-loe-validator-mcp logic.
"""

import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from routers import validation, chat


# Create upload and reports directories
UPLOAD_DIR = Path(__file__).parent / "uploads"
REPORTS_DIR = Path(__file__).parent / "reports"
UPLOAD_DIR.mkdir(exist_ok=True)
REPORTS_DIR.mkdir(exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    # Startup
    print("🚀 LOE Validator API starting up...")
    print(f"📁 Upload directory: {UPLOAD_DIR}")
    print(f"📄 Reports directory: {REPORTS_DIR}")
    yield
    # Shutdown
    print("👋 LOE Validator API shutting down...")


app = FastAPI(
    title="LOE Validator API",
    description="Validate Statement of Work (SOW) against Level of Effort (LOE) estimates",
    version="1.0.0",
    lifespan=lifespan,
)

# Configure CORS for Next.js frontend
# Get allowed origins from environment or use defaults
CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "").split(",") if os.environ.get("CORS_ORIGINS") else []
CORS_ORIGINS.extend([
    "http://localhost:3000",
    "http://127.0.0.1:3000",
])
# Filter out empty strings
CORS_ORIGINS = [origin.strip() for origin in CORS_ORIGINS if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(validation.router, prefix="/api", tags=["validation"])
app.include_router(chat.router, prefix="/api", tags=["chat"])

# Serve generated reports as static files
app.mount("/reports", StaticFiles(directory=str(REPORTS_DIR)), name="reports")


@app.get("/")
async def root():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "LOE Validator API",
        "version": "1.0.0",
    }


@app.get("/health")
async def health_check():
    """Detailed health check."""
    return {
        "status": "healthy",
        "upload_dir_exists": UPLOAD_DIR.exists(),
        "reports_dir_exists": REPORTS_DIR.exists(),
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
