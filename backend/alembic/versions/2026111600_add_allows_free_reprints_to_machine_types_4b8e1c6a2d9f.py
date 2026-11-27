"""Add allows_free_reprints to machine_types

The reprint policy covers the Prusa printers only. Gating on the resource unit
alone can't distinguish a Prusa from any other filament machine, so eligibility
is a property of the machine type that eboard sets.

Defaults to false, so every existing machine type starts ineligible and the
Prusa types have to be ticked after this is deployed.

Revision ID: 4b8e1c6a2d9f
Revises: 9c2a4d7e1f3b
Create Date: 2026-11-16 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "4b8e1c6a2d9f"
down_revision = "9c2a4d7e1f3b"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "machine_types",
        sa.Column(
            "allows_free_reprints",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade():
    op.drop_column("machine_types", "allows_free_reprints")
