"""add name to training_sessions

Revision ID: 1769520400
Revises: 1769520300
Create Date: 2026-01-29

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "1769520400"
down_revision: Union[str, None] = "1769520300"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("training_sessions", sa.Column("name", sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column("training_sessions", "name")
