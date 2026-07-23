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


def ensure_user_partner_type_column() -> None:
    """Add partner_type to Wellora_Users if the table predates that column."""
def ensure_diet_chat_summary_columns() -> None:
    """Add rolling-memory columns when the conversation table already exists."""
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                IF OBJECT_ID('Wellora_Users', 'U') IS NOT NULL
                AND COL_LENGTH('Wellora_Users', 'partner_type') IS NULL
                ALTER TABLE Wellora_Users ADD partner_type NVARCHAR(20) NULL;
                """
            )
        )


def ensure_user_registration_review_columns() -> None:
    """Add partner/vendor approval review fields when absent."""
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
                IF OBJECT_ID('Wellora_Users', 'U') IS NOT NULL
                AND COL_LENGTH('Wellora_Users', 'organization_name') IS NULL
                ALTER TABLE Wellora_Users ADD organization_name NVARCHAR(200) NULL;
                """
            )
        )
        conn.execute(
            text(
                """
                IF OBJECT_ID('Wellora_Users', 'U') IS NOT NULL
                AND COL_LENGTH('Wellora_Users', 'tin_number') IS NULL
                ALTER TABLE Wellora_Users ADD tin_number NVARCHAR(80) NULL;
                """
            )
        )
        conn.execute(
            text(
                """
                IF OBJECT_ID('Wellora_Users', 'U') IS NOT NULL
                AND COL_LENGTH('Wellora_Users', 'company_registration_number') IS NULL
                ALTER TABLE Wellora_Users ADD company_registration_number NVARCHAR(100) NULL;
                """
            )
        )
        conn.execute(
            text(
                """
                IF OBJECT_ID('Wellora_Users', 'U') IS NOT NULL
                AND COL_LENGTH('Wellora_Users', 'address') IS NULL
                ALTER TABLE Wellora_Users ADD address NVARCHAR(300) NULL;
                """
            )
        )
        conn.execute(
            text(
                """
                IF OBJECT_ID('Wellora_Users', 'U') IS NOT NULL
                AND COL_LENGTH('Wellora_Users', 'registration_status') IS NULL
                ALTER TABLE Wellora_Users ADD registration_status NVARCHAR(30) NOT NULL DEFAULT 'approved';
                """
            )
        )
        conn.execute(
            text(
                """
                IF OBJECT_ID('Wellora_Users', 'U') IS NOT NULL
                AND COL_LENGTH('Wellora_Users', 'approval_date') IS NULL
                ALTER TABLE Wellora_Users ADD approval_date DATETIME NULL;
                """
            )
        )


def ensure_partner_portal_tables() -> None:
    """Create partner client and recommendation tables when absent."""
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                IF OBJECT_ID('Wellora_PartnerClients', 'U') IS NULL
                CREATE TABLE Wellora_PartnerClients (
                    id INT IDENTITY(1,1) PRIMARY KEY,
                    partner_user_id INT NOT NULL,
                    user_id INT NOT NULL UNIQUE,
                    gender NVARCHAR(20) NULL,
                    age INT NULL,
                    fitness_goal NVARCHAR(100) NULL,
                    dietary_preference NVARCHAR(100) NULL,
                    notes NVARCHAR(1000) NULL,
                    status NVARCHAR(30) NOT NULL DEFAULT 'Active',
                    invitation_token NVARCHAR(120) NULL UNIQUE,
                    invitation_status NVARCHAR(30) NOT NULL DEFAULT 'sent',
                    invited_at DATETIME NOT NULL DEFAULT GETUTCDATE(),
                    accepted_at DATETIME NULL,
                    is_active BIT NOT NULL DEFAULT 1,
                    CONSTRAINT FK_PartnerClients_Partner FOREIGN KEY (partner_user_id) REFERENCES Wellora_Users(id),
                    CONSTRAINT FK_PartnerClients_User FOREIGN KEY (user_id) REFERENCES Wellora_Users(id)
                );
                """
            )
        )
        conn.execute(
            text(
                """
                IF OBJECT_ID('Wellora_PartnerMealRecommendations', 'U') IS NULL
                CREATE TABLE Wellora_PartnerMealRecommendations (
                    id INT IDENTITY(1,1) PRIMARY KEY,
                    partner_user_id INT NOT NULL,
                    client_user_id INT NOT NULL,
                    meal_id INT NOT NULL,
                    note NVARCHAR(1000) NULL,
                    status NVARCHAR(30) NOT NULL DEFAULT 'sent',
                    created_at DATETIME NOT NULL DEFAULT GETUTCDATE(),
                    CONSTRAINT FK_PartnerMealRecommendations_Partner FOREIGN KEY (partner_user_id) REFERENCES Wellora_Users(id),
                    CONSTRAINT FK_PartnerMealRecommendations_Client FOREIGN KEY (client_user_id) REFERENCES Wellora_Users(id),
                    CONSTRAINT FK_PartnerMealRecommendations_Meal FOREIGN KEY (meal_id) REFERENCES Wellora_Meals(id)
                );
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


def ensure_order_checkout_columns() -> None:
    """Add checkout/payment fields to existing order rows without replacing old data."""
    columns = [
        ("payment_status", "NVARCHAR(20) NOT NULL DEFAULT 'paid'"),
        ("order_status", "NVARCHAR(30) NOT NULL DEFAULT 'placed'"),
        ("stripe_session_id", "NVARCHAR(255) NULL"),
        ("checkout_reference", "NVARCHAR(80) NULL"),
        ("recipient_name", "NVARCHAR(100) NULL"),
        ("recipient_phone", "NVARCHAR(30) NULL"),
        ("delivery_address", "NVARCHAR(500) NULL"),
        ("delivery_city", "NVARCHAR(100) NULL"),
        ("delivery_postal_code", "NVARCHAR(30) NULL"),
        ("delivery_notes", "NVARCHAR(500) NULL"),
    ]
    with engine.begin() as conn:
        for name, definition in columns:
            conn.execute(
                text(
                    f"""
                    IF OBJECT_ID('Wellora_Orders', 'U') IS NOT NULL
                    AND COL_LENGTH('Wellora_Orders', '{name}') IS NULL
                    ALTER TABLE Wellora_Orders ADD {name} {definition};
                    """
                )
            )
