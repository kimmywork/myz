#!/bin/bash

# Create a local branch
git subtree split --prefix=myz-annotator/src/background/sync -b sync-master

# Force push
git push -f sync-master sync:master

git subtree push --prefix=myz-annotator/src/background/sync sync master

# Drop the local branch
git branch -D sync-master