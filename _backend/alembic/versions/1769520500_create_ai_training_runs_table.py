"""create ai_training_runs table

Revision ID: 1769520500
Revises: merge_heads
Create Date: 2026-02-10

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "1769520500"
down_revision: Union[str, None] = "merge_heads"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ai_training_runs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("session_ids", sa.JSON(), nullable=False),
        sa.Column("conclusion_text", sa.Text(), nullable=True),
        sa.Column("conclusion_data", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
    )
    op.create_index(op.f("ix_ai_training_runs_id"), "ai_training_runs", ["id"], unique=False)
    op.create_index(op.f("ix_ai_training_runs_user_id"), "ai_training_runs", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_ai_training_runs_user_id"), table_name="ai_training_runs")
    op.drop_index(op.f("ix_ai_training_runs_id"), table_name="ai_training_runs")
    op.drop_table("ai_training_runs")
