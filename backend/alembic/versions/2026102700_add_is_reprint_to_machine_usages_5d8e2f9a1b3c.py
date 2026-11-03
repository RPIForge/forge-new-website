"""Add is_reprint to machine_usages

Revision ID: 5d8e2f9a1b3c
Revises: 7e3f1a2b4c6d
Create Date: 2026-10-27 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "5d8e2f9a1b3c"
down_revision = "7e3f1a2b4c6d"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "machine_usages",
        sa.Column("is_reprint", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade():
    op.drop_column("machine_usages", "is_reprint")
