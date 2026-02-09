"""merge multiple heads

Revision ID: merge_heads
Revises: 1769520200, 1769520400
Create Date: 2026-02-10

"""
from typing import Sequence, Union
from alembic import op

revision: str = "merge_heads"
down_revision: Union[str, None] = ("1769520200", "1769520400")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
