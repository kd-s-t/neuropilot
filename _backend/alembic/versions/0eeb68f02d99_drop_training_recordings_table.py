"""drop training_recordings table

Revision ID: 0eeb68f02d99
Revises: 004
Create Date: 2026-01-26 01:23:43.209977

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0eeb68f02d99'
down_revision: Union[str, None] = '004'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_index(op.f("ix_training_recordings_training_session_id"), table_name="training_recordings")
    op.drop_index(op.f("ix_training_recordings_id"), table_name="training_recordings")
    op.drop_table("training_recordings")


def downgrade() -> None:
    op.create_table(
        "training_recordings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("training_session_id", sa.Integer(), nullable=False),
        sa.Column("timestamp", sa.DateTime(), nullable=False),
        sa.Column("position_x", sa.Float(), nullable=False),
        sa.Column("position_y", sa.Float(), nullable=False),
        sa.Column("band_powers", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["training_session_id"], ["training_sessions.id"]),
    )
    op.create_index(op.f("ix_training_recordings_id"), "training_recordings", ["id"], unique=False)
    op.create_index(op.f("ix_training_recordings_training_session_id"), "training_recordings", ["training_session_id"], unique=False)
