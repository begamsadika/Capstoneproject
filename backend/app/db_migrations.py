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


def ensure_meal_ingredients_column() -> None:
    """Add ingredients JSON text to Wellora_Meals if the table predates it."""
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                IF OBJECT_ID('Wellora_Meals', 'U') IS NOT NULL
                AND COL_LENGTH('Wellora_Meals', 'ingredients') IS NULL
                ALTER TABLE Wellora_Meals ADD ingredients NVARCHAR(MAX) NULL;
                """
            )
        )


def ensure_user_is_active_column() -> None:
    """Add is_active to Wellora_Users if the table predates that column."""
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                IF OBJECT_ID('Wellora_Users', 'U') IS NOT NULL
                AND COL_LENGTH('Wellora_Users', 'is_active') IS NULL
                ALTER TABLE Wellora_Users ADD is_active BIT NOT NULL DEFAULT 1;
                """
            )
        )
