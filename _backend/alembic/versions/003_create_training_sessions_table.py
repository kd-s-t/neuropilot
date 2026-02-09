"""create training_sessions table

Revision ID: 003
Revises: 002
Create Date: 2025-01-24

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "training_sessions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("ended_at", sa.DateTime(), nullable=True),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column("data", postgresql.JSON(astext_type=sa.Text()), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
    )
    op.create_index(op.f("ix_training_sessions_id"), "training_sessions", ["id"], unique=False)
    op.create_index(op.f("ix_training_sessions_user_id"), "training_sessions", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_training_sessions_user_id"), table_name="training_sessions")
    op.drop_index(op.f("ix_training_sessions_id"), table_name="training_sessions")
    op.drop_table("training_sessions")
