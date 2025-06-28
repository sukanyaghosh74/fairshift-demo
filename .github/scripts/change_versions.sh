#!/bin/bash

# Expects the following environment variables to be set:
#   $OLD_JAVA_VERSION                 (Example: "1.1.0")
#   $NEW_JAVA_VERSION                 (Example: "1.2.0")
#   $OLD_PYTHON_VERSION               (Example: "1.1.0b0")
#   $NEW_PYTHON_VERSION               (Example: "1.2.0b0")

echo "Old Java version: $OLD_JAVA_VERSION"
echo "Old Python version: $OLD_PYTHON_VERSION"
echo "New Java version: $NEW_JAVA_VERSION"
echo "New Python version: $NEW_PYTHON_VERSION"

# Replaces the old version by the new version.
find . -name pom.xml | xargs sed -i "s/>$OLD_JAVA_VERSION</>$NEW_JAVA_VERSION</g"
find . -name build.gradle | xargs sed -i "s/\"$OLD_JAVA_VERSION\"/\"$NEW_JAVA_VERSION\"/g"
find . -name pyproject.toml | xargs sed -i "s/timefold == $OLD_PYTHON_VERSION/timefold == $NEW_PYTHON_VERSION/g"
