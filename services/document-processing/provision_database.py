"""Explicit, repeatable setup of the service database on an existing server.

Only the one-shot provisioning container receives administrator credentials.
Existing databases/roles are reused only if marked as managed by this script.
"""

import os
import re
import sys

import psycopg
from psycopg import sql

MARKER = "studyforge-document-processing-foundation"


def required(name):
    value = os.environ.get(name, "")
    if not value:
        raise ValueError(f"Missing {name}.")
    return value


def provision():
    database = required("PROCESSING_DB_NAME")
    role = required("PROCESSING_DB_USER")
    password = required("PROCESSING_DB_PASSWORD")
    admin = required("PROCESSING_DB_ADMIN_USER")
    application_db = required("PROCESSING_APPLICATION_DB")
    for name in (database, role):
        if not re.fullmatch(r"[a-z][a-z0-9_]{0,62}", name) or name.startswith("pg_"):
            raise ValueError("Processing database/role names must be simple lowercase PostgreSQL identifiers.")
    if database in {application_db, "postgres", "template0", "template1"} or role == admin:
        raise ValueError("Processing must use a separate database and role.")

    connection_options = {
        "host": required("PROCESSING_DB_HOST"),
        "port": os.environ.get("PROCESSING_DB_PORT", "5432"),
        "user": admin,
        "password": required("PROCESSING_DB_ADMIN_PASSWORD"),
        "connect_timeout": 5,
        "autocommit": True,
    }
    with psycopg.connect(dbname="postgres", **connection_options) as connection:
        existing_db = connection.execute(
            "SELECT pg_get_userbyid(datdba), shobj_description(oid, 'pg_database') "
            "FROM pg_database WHERE datname = %s", (database,),
        ).fetchone()
        if existing_db and existing_db != (role, MARKER):
            raise ValueError("Refusing to modify an existing database not owned and marked by this setup.")

        existing_role = connection.execute(
            "SELECT shobj_description(oid, 'pg_authid'), rolsuper, rolcreatedb, "
            "rolcreaterole, rolreplication, rolbypassrls, "
            "EXISTS (SELECT 1 FROM pg_auth_members WHERE member = r.oid) "
            "FROM pg_roles r WHERE rolname = %s", (role,),
        ).fetchone()
        if existing_role and existing_role != (MARKER, False, False, False, False, False, False):
            raise ValueError("Refusing to reuse an unmarked, privileged, or role-member account.")

        with connection.transaction():
            if not existing_role:
                connection.execute(sql.SQL(
                    "CREATE ROLE {} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE "
                    "NOREPLICATION NOBYPASSRLS NOINHERIT"
                ).format(sql.Identifier(role)))
                connection.execute(sql.SQL("COMMENT ON ROLE {} IS {}").format(
                    sql.Identifier(role), sql.Literal(MARKER),
                ))
            # Reruns can explicitly rotate this managed role's password.
            connection.execute(sql.SQL("ALTER ROLE {} PASSWORD {}").format(
                sql.Identifier(role), sql.Literal(password),
            ))
        if not existing_db:
            connection.execute(sql.SQL("CREATE DATABASE {} OWNER {}").format(
                sql.Identifier(database), sql.Identifier(role),
            ))
            connection.execute(sql.SQL("COMMENT ON DATABASE {} IS {}").format(
                sql.Identifier(database), sql.Literal(MARKER),
            ))
        connection.execute(sql.SQL("REVOKE ALL ON DATABASE {} FROM PUBLIC").format(sql.Identifier(database)))

    with psycopg.connect(dbname=database, **connection_options) as connection:
        connection.execute("REVOKE CREATE ON SCHEMA public FROM PUBLIC")
    print("Processing database and restricted role are ready.")


if __name__ == "__main__":
    try:
        provision()
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1)
    except psycopg.Error:
        # Do not expose SQL containing credentials or connection details.
        print("Processing database setup failed; check administrator access and server availability.", file=sys.stderr)
        raise SystemExit(1)
