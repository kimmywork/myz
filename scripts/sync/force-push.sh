#!/bin/bash

# Create a local branch
git subtree split --prefix=packages/sync-core -b sync-master

# Force push
git push -f sync sync-master:master

git subtree push --prefix=packages/sync-core sync master

# Drop the local branch
git branch -D sync-master