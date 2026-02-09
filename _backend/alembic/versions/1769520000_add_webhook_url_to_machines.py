"""add_webhook_url_to_machines

Revision ID: 1769520000
Revises: 32f36d2df026
Create Date: 2026-01-27 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1769520000'
down_revision: Union[str, None] = 'remove_controls_column'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("machines", sa.Column("webhook_url", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("machines", "webhook_url")
