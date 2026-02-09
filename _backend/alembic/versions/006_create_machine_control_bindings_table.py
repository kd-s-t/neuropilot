"""create machine_control_bindings table

Revision ID: 006
Revises: 005
Create Date: 2026-01-26

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "machine_control_bindings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("machine_id", sa.Integer(), nullable=False),
        sa.Column("control_id", sa.String(), nullable=False),
        sa.Column("training_session_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["machine_id"], ["machines.id"]),
        sa.ForeignKeyConstraint(["training_session_id"], ["training_sessions.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.UniqueConstraint("machine_id", "control_id", name="uq_machine_control"),
    )
    op.create_index(op.f("ix_machine_control_bindings_id"), "machine_control_bindings", ["id"], unique=False)
    op.create_index(op.f("ix_machine_control_bindings_machine_id"), "machine_control_bindings", ["machine_id"], unique=False)
    op.create_index(op.f("ix_machine_control_bindings_training_session_id"), "machine_control_bindings", ["training_session_id"], unique=False)
    op.create_index(op.f("ix_machine_control_bindings_user_id"), "machine_control_bindings", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_machine_control_bindings_user_id"), table_name="machine_control_bindings")
    op.drop_index(op.f("ix_machine_control_bindings_training_session_id"), table_name="machine_control_bindings")
    op.drop_index(op.f("ix_machine_control_bindings_machine_id"), table_name="machine_control_bindings")
    op.drop_index(op.f("ix_machine_control_bindings_id"), table_name="machine_control_bindings")
    op.drop_table("machine_control_bindings")
