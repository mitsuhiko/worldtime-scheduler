GIT_PREFIX=GIT_DIR=.heroku-git GIT_WORK_TREE=.heroku-git-worktree

init-heroku:
	@$(GIT_PREFIX) git init
	@$(GIT_PREFIX) git remote add heroku git@heroku.com:worldtimesched.git
	@$(GIT_PREFIX) mkdir .heroku-git-worktree
	@cp -R heroku-specifics/* .heroku-git-worktree

deploy:
	@rsync -a ./ .heroku-git-worktree/
	@$(GIT_PREFIX) git add -f data/*.json
	@$(GIT_PREFIX) git add .
	@$(GIT_PREFIX) git commit -m "Deploy `date`"
	@$(GIT_PREFIX) git push heroku

.PHONY: init-heroku deploy
