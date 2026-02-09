"""create machine_logs table

Revision ID: 1769520200
Revises: 1769520100
Create Date: 2026-01-27 22:56:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1769520200'
down_revision: Union[str, None] = '1769520100'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "machine_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("machine_id", sa.Integer(), nullable=False),
        sa.Column("control_id", sa.String(), nullable=False),
        sa.Column("webhook_url", sa.String(), nullable=False),
        sa.Column("value", sa.Integer(), nullable=True),
        sa.Column("success", sa.Boolean(), nullable=False),
        sa.Column("status_code", sa.Integer(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("response_data", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["machine_id"], ["machines.id"]),
    )
    op.create_index(op.f("ix_machine_logs_id"), "machine_logs", ["id"], unique=False)
    op.create_index(op.f("ix_machine_logs_machine_id"), "machine_logs", ["machine_id"], unique=False)
    op.create_index(op.f("ix_machine_logs_control_id"), "machine_logs", ["control_id"], unique=False)
    op.create_index(op.f("ix_machine_logs_created_at"), "machine_logs", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_machine_logs_created_at"), table_name="machine_logs")
    op.drop_index(op.f("ix_machine_logs_control_id"), table_name="machine_logs")
    op.drop_index(op.f("ix_machine_logs_machine_id"), table_name="machine_logs")
    op.drop_index(op.f("ix_machine_logs_id"), table_name="machine_logs")
    op.drop_table("machine_logs")
