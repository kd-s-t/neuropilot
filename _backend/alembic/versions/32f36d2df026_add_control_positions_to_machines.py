"""add_control_positions_to_machines

Revision ID: 32f36d2df026
Revises: 006
Create Date: 2026-01-26 21:59:10.230327

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '32f36d2df026'
down_revision: Union[str, None] = '006'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("machines", sa.Column("control_positions", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("machines", "control_positions")
