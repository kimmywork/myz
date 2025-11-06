#!/bin/bash

# Create a local branch
git subtree split --prefix=website -b website_master

# Force push
git push -f website website_master:master

# Drop the local branch
git branch -D website_master
