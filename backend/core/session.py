"""
SQLAlchemy async engine and sessions tools

https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html
"""

from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from . import config

if config.settings.ENVIRONMENT == "PYTEST":
    sqlalchemy_database_uri = config.settings.TEST_SQLALCHEMY_DATABASE_URI
else:
    sqlalchemy_database_uri = config.settings.DEFAULT_SQLALCHEMY_DATABASE_URI

# Never log the URI as-is: it carries the database password, which would then
# sit in container logs. render_as_string(hide_password=True) keeps the useful
# part -- which host and database we actually connected to -- and masks the rest.
print(
    "Using database URI: "
    f"{make_url(sqlalchemy_database_uri).render_as_string(hide_password=True)}"
)

engine_kwargs = {"pool_pre_ping": True}

if config.settings.ENVIRONMENT == "PYTEST":
    # pytest-asyncio gives each test its own event loop, and an asyncpg
    # connection is bound to the loop that opened it. A pooled connection
    # handed to a later test therefore fails with "got Future attached to a
    # different loop". Not pooling at all under PYTEST costs a connection per
    # checkout and makes the suite loop-agnostic.
    engine_kwargs["poolclass"] = NullPool

async_engine = create_async_engine(sqlalchemy_database_uri, **engine_kwargs)
async_session = async_sessionmaker(async_engine, expire_on_commit=False)
