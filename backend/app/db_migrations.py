from sqlalchemy import text
from .database import engine


def ensure_meal_image_filename_column() -> None:
    """Add image_filename to Wellora_Meals if the table predates that column."""
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                IF OBJECT_ID('Wellora_Meals', 'U') IS NOT NULL
                AND COL_LENGTH('Wellora_Meals', 'image_filename') IS NULL
                ALTER TABLE Wellora_Meals ADD image_filename NVARCHAR(300) NULL;
                """
            )
        )
