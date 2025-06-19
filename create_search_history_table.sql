-- Create search_history table for admin search history
CREATE TABLE search_history (
    admin_email VARCHAR(255) NOT NULL,
    sap_id INT NOT NULL,
    employee_name VARCHAR(255) NOT NULL,
    searched_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    CONSTRAINT PK_search_history PRIMARY KEY (admin_email, sap_id)
);

-- Create index for better performance
CREATE INDEX IX_search_history_admin_email ON search_history (admin_email);
CREATE INDEX IX_search_history_searched_at ON search_history (searched_at); 