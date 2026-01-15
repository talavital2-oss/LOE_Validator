"""
Chat Router

Handles AI-powered Q&A about validation results.
"""

import os
from typing import List

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from models.schemas import ChatRequest, ChatResponse, ChatMessage
from services.chat_service import ChatService


router = APIRouter()


def get_chat_service() -> ChatService:
    """Get or create chat service instance."""
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="ANTHROPIC_API_KEY environment variable not set"
        )
    return ChatService(api_key=api_key)


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    Ask a question about validation results.
    
    The AI will use the validation results as context to answer questions.
    """
    try:
        service = get_chat_service()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to initialize chat service: {str(e)}"
        )
    
    try:
        response = service.chat(
            message=request.message,
            validation_result=request.validation_result,
            history=request.history,
        )
        
        return ChatResponse(
            response=response,
            sources=["validation_results"],
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Chat failed: {str(e)}"
        )


@router.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    """
    Stream AI response to a question about validation results.
    
    Returns a Server-Sent Events stream with response chunks.
    """
    try:
        service = get_chat_service()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to initialize chat service: {str(e)}"
        )
    
    async def generate():
        try:
            async for chunk in service.chat_stream(
                message=request.message,
                validation_result=request.validation_result,
                history=request.history,
            ):
                yield f"data: {chunk}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: Error: {str(e)}\n\n"
    
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


@router.get("/chat/health")
async def chat_health():
    """Check if chat service is properly configured."""
    api_key = os.getenv("ANTHROPIC_API_KEY")
    
    return {
        "configured": bool(api_key),
        "api_key_set": bool(api_key),
        "api_key_prefix": api_key[:10] + "..." if api_key else None,
    }
