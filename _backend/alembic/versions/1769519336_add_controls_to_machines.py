"""add_controls_to_machines

Revision ID: add_controls_to_machines
Revises: 19c7b624b8b9
Create Date: 2026-01-27

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'add_controls_to_machines'
down_revision: Union[str, None] = '19c7b624b8b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("machines", sa.Column("controls", postgresql.JSON(astext_type=sa.Text()), nullable=True))


def downgrade() -> None:
    op.drop_column("machines", "controls")
