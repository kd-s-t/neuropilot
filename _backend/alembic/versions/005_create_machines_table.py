"""create machines table

Revision ID: 005
Revises: 0eeb68f02d99
Create Date: 2026-01-26

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "005"
down_revision: Union[str, None] = "0eeb68f02d99"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "machines",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
    )
    op.create_index(op.f("ix_machines_id"), "machines", ["id"], unique=False)
    op.create_index(op.f("ix_machines_user_id"), "machines", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_machines_user_id"), table_name="machines")
    op.drop_index(op.f("ix_machines_id"), table_name="machines")
    op.drop_table("machines")
