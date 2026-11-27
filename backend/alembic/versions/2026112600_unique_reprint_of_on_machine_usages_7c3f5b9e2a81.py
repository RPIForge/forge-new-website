"""Make reprint_of unique on machine_usages

One failed print earns one free reprint. The API checks that before granting
one, but a check and an insert are not atomic: two submissions racing on the
same failure both read it as unclaimed, and both come away free. A unique
index makes the database the arbiter, so the loser of the race fails and is
turned back into the same refusal the check already produces.

Partial, because reprint_of_id is NULL on every usage that is not a free
reprint, and those have to stay unconstrained.

Revision ID: 7c3f5b9e2a81
Revises: 4b8e1c6a2d9f
Create Date: 2026-11-26 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "7c3f5b9e2a81"
down_revision = "4b8e1c6a2d9f"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_index("ix_machine_usages_reprint_of_id", table_name="machine_usages")
    op.create_index(
        "ix_machine_usages_reprint_of_id",
        "machine_usages",
        ["reprint_of_id"],
        unique=True,
        postgresql_where=sa.text("reprint_of_id IS NOT NULL"),
    )


def downgrade():
    op.drop_index("ix_machine_usages_reprint_of_id", table_name="machine_usages")
    op.create_index(
        "ix_machine_usages_reprint_of_id",
        "machine_usages",
        ["reprint_of_id"],
    )
