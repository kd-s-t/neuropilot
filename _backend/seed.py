from config.database import SessionLocal
from models import User
import bcrypt

def seed_user():
    db = SessionLocal()
    try:
        # Check if user already exists
        existing_user = db.query(User).filter(User.email == "kendan@g.c").first()
        
        password = "1234"
        # Use bcrypt directly - passlib can verify standard bcrypt hashes
        password_bytes = password.encode('utf-8')
        salt = bcrypt.gensalt()
        hashed_password = bcrypt.hashpw(password_bytes, salt).decode('utf-8')
        
        if existing_user:
            # Update existing user's password
            existing_user.hashed_password = hashed_password
            existing_user.is_active = True
            db.commit()
            db.refresh(existing_user)
            print(f"User password updated: {existing_user.email}")
            return
        
        # Create new user
        new_user = User(
            email="kendan@g.c",
            hashed_password=hashed_password,
            is_active=True
        )
        
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        print(f"User created successfully: {new_user.email}")
    except Exception as e:
        db.rollback()
        print(f"Error seeding user: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    seed_user()
