#!/bin/bash

# Create a local branch
git subtree split --prefix=mcp-myz-search -b mcp_myz_search_master

# Force push
git push -f search-mcp mcp_myz_search_master:master

git subtree push --prefix=mcp-myz-search search-mcp master

# Drop the local branch
git branch -D mcp_myz_search_master
