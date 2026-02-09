"""add_blueprint_to_machines

Revision ID: 19c7b624b8b9
Revises: 32f36d2df026
Create Date: 2026-01-26 22:01:43.323070

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '19c7b624b8b9'
down_revision: Union[str, None] = '32f36d2df026'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("machines", sa.Column("blueprint", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("machines", "blueprint")
