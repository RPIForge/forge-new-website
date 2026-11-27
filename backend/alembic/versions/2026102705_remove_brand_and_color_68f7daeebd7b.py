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


# Dropping brand and color collapses rows that differed only by those two
# columns into a single (name, units) pair, so the duplicates have to go before
# the new unique constraint can be added.
#
# They are MERGED rather than deleted. The two foreign keys below are recreated
# with ON DELETE CASCADE, so a plain `DELETE FROM resources` would take the
# referencing rows with it -- and resource_usage_quantities is the per-usage
# billing record (how much of a resource a usage consumed, and what it cost per
# unit at the time). Past usages would silently lose their material lines,
# charge sheets for earlier semesters would stop reconciling, and downgrade()
# could not bring any of it back. So every reference is repointed at the
# surviving row of its group first, and only resources nothing points at any
# more are deleted.
#
# The survivor is the lowest id in each (name, units) group -- the same row the
# bare DELETE kept. The window is deterministic and `resources` is untouched
# until the final DELETE, so every statement below computes the same map.
RANKED = """
    WITH ranked AS (
        SELECT id,
               FIRST_VALUE(id) OVER (
                   PARTITION BY name, units ORDER BY id
               ) AS keep_id
        FROM resources
    ),
    merge_map AS (
        SELECT id AS old_id, keep_id FROM ranked WHERE id <> keep_id
    )
"""


def upgrade():
    op.drop_constraint("resources_brand_color_name_units_key", "resources", type_="unique")
    op.drop_constraint("resource_slot_associations_resource_id_fkey", "resource_slot_associations", type_="foreignkey")
    op.create_foreign_key("resource_slot_associations_resource_id_fkey", "resource_slot_associations", "resources", ["resource_id"], ["id"], onupdate="CASCADE", ondelete="CASCADE")
    op.drop_constraint("resource_usage_quantities_resource_id_fkey", "resource_usage_quantities", type_="foreignkey")
    op.create_foreign_key("resource_usage_quantities_resource_id_fkey", "resource_usage_quantities", "resources", ["resource_id"], ["id"], onupdate="CASCADE", ondelete="CASCADE")

    # (resource_slot_id, resource_id) is the primary key of
    # resource_slot_associations, so a slot that listed several now-identical
    # resources cannot have them all repointed at the survivor. Collapse each
    # (slot, surviving resource) down to a single row first. Ordering by
    # resource_id keeps the survivor's own row when the slot already lists it,
    # and otherwise keeps the lowest-id duplicate, which the UPDATE below then
    # repoints. This is deliberately not written as "delete the rows whose slot
    # already lists the survivor": a slot can list two duplicates without
    # listing the survivor at all, and that case has to collapse too.
    op.execute("""
        WITH ranked AS (
            SELECT id,
                   FIRST_VALUE(id) OVER (
                       PARTITION BY name, units ORDER BY id
                   ) AS keep_id
            FROM resources
        ),
        collapsed AS (
            SELECT a.resource_slot_id,
                   a.resource_id,
                   ROW_NUMBER() OVER (
                       PARTITION BY a.resource_slot_id, r.keep_id
                       ORDER BY a.resource_id
                   ) AS row_num
            FROM resource_slot_associations a
            JOIN ranked r ON r.id = a.resource_id
        )
        DELETE FROM resource_slot_associations a
        USING collapsed c
        WHERE a.resource_slot_id = c.resource_slot_id
          AND a.resource_id = c.resource_id
          AND c.row_num > 1;
    """)
    op.execute(RANKED + """
        UPDATE resource_slot_associations a
        SET resource_id = m.keep_id
        FROM merge_map m
        WHERE a.resource_id = m.old_id;
    """)

    # resource_usage_quantities has no uniqueness across
    # (machine_usage_id, resource_id) -- the composite primary key it was
    # created with covered resource_slot_id, which was dropped in
    # 705c79f09e28, taking the constraint with it -- so every row here can be
    # repointed and the recorded amount and cpu_at_usage are preserved exactly.
    op.execute(RANKED + """
        UPDATE resource_usage_quantities q
        SET resource_id = m.keep_id
        FROM merge_map m
        WHERE q.resource_id = m.old_id;
    """)

    # Only resources nothing references any more. The cascades above are now
    # harmless because no reference points at an old_id.
    op.execute(RANKED + """
        DELETE FROM resources r
        USING merge_map m
        WHERE r.id = m.old_id;
    """)

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
