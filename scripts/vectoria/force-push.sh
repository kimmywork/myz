#!/bin/bash

# Create a local branch
git subtree split --prefix=packages/vectoria -b vectoria-master

# Force push
git push -f vectoria vectoria-master:master

git subtree push --prefix=packages/vectoria vectoria master

# Drop the local branch
git branch -D vectoria-master
