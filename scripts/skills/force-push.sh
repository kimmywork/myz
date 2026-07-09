#!/bin/bash

# Create a local branch
git subtree split --prefix=myz-skills -b skills-master

# Force push
git push -f skills skills-master:master

git subtree push --prefix=myz-skills skills master

# Drop the local branch
git branch -D skills-master
