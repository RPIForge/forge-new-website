"""Add reprint_of to machine_usages

Links a reprint to the failed usage it replaces, so the reprint policy can
tell whether a failure has already been reprinted and how much material the
failed print used.

Revision ID: 9c2a4d7e1f3b
Revises: 68f7daeebd7b
Create Date: 2026-11-15 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "9c2a4d7e1f3b"
down_revision = "68f7daeebd7b"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "machine_usages",
        sa.Column("reprint_of_id", sa.UUID(), nullable=True),
    )
    op.create_foreign_key(
        "fk_reprint_of",
        "machine_usages",
        "machine_usages",
        ["reprint_of_id"],
        ["id"],
    )
    # Every eligibility check looks up "has this failure been claimed", which
    # is a lookup by this column.
    op.create_index(
        "ix_machine_usages_reprint_of_id",
        "machine_usages",
        ["reprint_of_id"],
    )


def downgrade():
    op.drop_index("ix_machine_usages_reprint_of_id", table_name="machine_usages")
    op.drop_constraint("fk_reprint_of", "machine_usages", type_="foreignkey")
    op.drop_column("machine_usages", "reprint_of_id")
