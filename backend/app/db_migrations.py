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


def ensure_diet_chat_summary_columns() -> None:
    """Add rolling-memory columns when the conversation table already exists."""
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                IF OBJECT_ID('Wellora_DietChatConversations', 'U') IS NOT NULL
                AND COL_LENGTH('Wellora_DietChatConversations', 'summary') IS NULL
                ALTER TABLE Wellora_DietChatConversations ADD summary NVARCHAR(MAX) NULL;

                IF OBJECT_ID('Wellora_DietChatConversations', 'U') IS NOT NULL
                AND COL_LENGTH('Wellora_DietChatConversations', 'summary_through_message_id') IS NULL
                ALTER TABLE Wellora_DietChatConversations ADD summary_through_message_id INT NULL;
                """
            )
        )


def ensure_user_medical_profile_columns() -> None:
    """Add optional user-reported conditions and medications to profile tables."""
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                IF OBJECT_ID('Wellora_UserProfiles', 'U') IS NOT NULL
                AND COL_LENGTH('Wellora_UserProfiles', 'medical_conditions') IS NULL
                ALTER TABLE Wellora_UserProfiles ADD medical_conditions NVARCHAR(1000) NULL;

                IF OBJECT_ID('Wellora_UserProfiles', 'U') IS NOT NULL
                AND COL_LENGTH('Wellora_UserProfiles', 'medications') IS NULL
                ALTER TABLE Wellora_UserProfiles ADD medications NVARCHAR(1000) NULL;

                IF OBJECT_ID('Wellora_HealthMetrics', 'U') IS NOT NULL
                AND COL_LENGTH('Wellora_HealthMetrics', 'medical_conditions') IS NULL
                ALTER TABLE Wellora_HealthMetrics ADD medical_conditions NVARCHAR(1000) NULL;

                IF OBJECT_ID('Wellora_HealthMetrics', 'U') IS NOT NULL
                AND COL_LENGTH('Wellora_HealthMetrics', 'medications') IS NULL
                ALTER TABLE Wellora_HealthMetrics ADD medications NVARCHAR(1000) NULL;
                """
            )
        )
