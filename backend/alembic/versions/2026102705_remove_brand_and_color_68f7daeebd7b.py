"""remove brand and color

Revision ID: 68f7daeebd7b
Revises: 5d8e2f9a1b3c
Create Date: 2026-10-27 22:05:32.782796

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "68f7daeebd7b"
down_revision = "5d8e2f9a1b3c"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_constraint("resources_brand_color_name_units_key", "resources", type_="unique")
    op.drop_constraint("resource_slot_associations_resource_id_fkey", "resource_slot_associations", type_="foreignkey")
    op.create_foreign_key("resource_slot_associations_resource_id_fkey", "resource_slot_associations", "resources", ["resource_id"], ["id"], onupdate="CASCADE", ondelete="CASCADE")
    op.drop_constraint("resource_usage_quantities_resource_id_fkey", "resource_usage_quantities", type_="foreignkey")
    op.create_foreign_key("resource_usage_quantities_resource_id_fkey", "resource_usage_quantities", "resources", ["resource_id"], ["id"], onupdate="CASCADE", ondelete="CASCADE")
    op.execute("DELETE FROM resources WHERE id IN (SELECT id FROM (SELECT id, ROW_NUMBER() OVER(Partition by name, units ORDER BY id) AS row_num FROM resources) t WHERE t.row_num > 1);")
    op.create_unique_constraint("uq_resources", "resources", ["name", "units"])
    op.drop_column("resources", "color")
    op.drop_column("resources", "brand")


def downgrade():
    op.add_column("resources", sa.Column("color", sa.String(), nullable=True))
    op.add_column("resources", sa.Column("brand", sa.String(), nullable=True))
    op.drop_constraint("resource_usage_quantities_resource_id_fkey", "resource_usage_quantities", type_="foreignkey")
    op.create_foreign_key("resource_usage_quantities_resource_id_fkey", "resource_usage_quantities", "resources", ["resource_id"], ["id"])
    op.drop_constraint("resource_slot_associations_resource_id_fkey", "resource_slot_associations", type_="foreignkey")
    op.create_foreign_key("resource_slot_associations_resource_id_fkey", "resource_slot_associations", "resources", ["resource_id"], ["id"])
    op.drop_constraint("uq_resources", "resources", type_="unique")
    op.create_unique_constraint("resources_brand_color_name_units_key", "resources", ["brand", "color", "name", "units"])