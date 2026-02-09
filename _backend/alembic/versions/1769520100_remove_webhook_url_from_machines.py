"""remove_webhook_url_from_machines

Revision ID: 1769520100
Revises: 1769520000
Create Date: 2026-01-27 12:01:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1769520100'
down_revision: Union[str, None] = '1769520000'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("machines", "webhook_url")


def downgrade() -> None:
    op.add_column("machines", sa.Column("webhook_url", sa.String(), nullable=True))
