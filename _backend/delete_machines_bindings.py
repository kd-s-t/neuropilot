#!/usr/bin/env python3
"""Script to delete all machines and machine control bindings from the database"""

import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from config.database import SessionLocal
from models import Machine, MachineControlBinding

def delete_all_machines_and_bindings():
    """Delete all machines and their bindings from the database"""
    db = SessionLocal()
    try:
        # Delete all bindings first (due to foreign key constraint)
        bindings_count = db.query(MachineControlBinding).count()
        db.query(MachineControlBinding).delete()
        print(f"Deleted {bindings_count} machine control bindings")
        
        # Delete all machines
        machines_count = db.query(Machine).count()
        db.query(Machine).delete()
        print(f"Deleted {machines_count} machines")
        
        db.commit()
        print("Successfully deleted all machines and bindings")
    except Exception as e:
        db.rollback()
        print(f"Error deleting machines and bindings: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    delete_all_machines_and_bindings()
