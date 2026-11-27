"""Main FastAPI app instance declaration."""

import asyncio
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware

from api.api import api_router
from api.auto_clear import auto_clear_loop
from core import config
from core.session import async_session


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Run the auto-clear sweep for as long as the app is up.

    In production this runs in every uvicorn worker. The sweep is written to
    tolerate that, so no coordination is needed here.
    """
    sweeper = asyncio.create_task(auto_clear_loop(async_session))
    try:
        yield
    finally:
        sweeper.cancel()
        with suppress(asyncio.CancelledError):
            await sweeper


app = FastAPI(
    root_path="/api",
    lifespan=lifespan,
)
app.include_router(api_router)

# Sets all CORS enabled origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=[str(origin) for origin in config.settings.BACKEND_CORS_ORIGINS],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Guards against HTTP Host Header attacks
app.add_middleware(TrustedHostMiddleware, allowed_hosts=config.settings.ALLOWED_HOSTS)
