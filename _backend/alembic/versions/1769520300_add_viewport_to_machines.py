"""add viewport to machines

Revision ID: 1769520300
Revises: 32f36d2df026
Create Date: 2026-01-29 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '1769520300'
down_revision = '32f36d2df026'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('machines', sa.Column('viewport', sa.JSON(), nullable=True))


def downgrade():
    op.drop_column('machines', 'viewport')
