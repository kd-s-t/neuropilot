"""remove_controls_column

Revision ID: remove_controls_column
Revises: add_controls_to_machines
Create Date: 2026-01-27

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'remove_controls_column'
down_revision: Union[str, None] = 'add_controls_to_machines'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("machines", "controls")


def downgrade() -> None:
    op.add_column("machines", sa.Column("controls", sa.JSON(), nullable=True))
