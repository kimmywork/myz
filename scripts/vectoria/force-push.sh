#!/bin/bash

# Create a local branch
git subtree split --prefix=vectoria -b vectoria-master

# Force push
git push -f vectoria-master vectoria:master

git subtree push --prefix=vectoria vectoria master

# Drop the local branch
git branch -D vectoria-master
