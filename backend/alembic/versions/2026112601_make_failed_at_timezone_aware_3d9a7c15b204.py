"""Make failed_at timezone-aware

failed_at was TIMESTAMP WITHOUT TIME ZONE, written with a bare
datetime.now(). It therefore serialised with no offset, and a browser
parsing it with new Date() read it as the viewer's own local time rather
than the instant it happened -- enough to show the wrong day for anything
that failed near midnight. time_started next to it has always been
timestamptz, so the two did not even agree with each other.

Existing values are interpreted as UTC on the way across, which is what
they are: the application containers run with TZ unset, so datetime.now()
has been producing UTC all along.

Revision ID: 3d9a7c15b204
Revises: 7c3f5b9e2a81
Create Date: 2026-11-26 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "3d9a7c15b204"
down_revision = "7c3f5b9e2a81"
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column(
        "machine_usages",
        "failed_at",
        existing_type=sa.DateTime(),
        type_=sa.DateTime(timezone=True),
        existing_nullable=True,
        postgresql_using="failed_at AT TIME ZONE 'UTC'",
    )


def downgrade():
    op.alter_column(
        "machine_usages",
        "failed_at",
        existing_type=sa.DateTime(timezone=True),
        type_=sa.DateTime(),
        existing_nullable=True,
        postgresql_using="failed_at AT TIME ZONE 'UTC'",
    )
