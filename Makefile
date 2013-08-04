init-heroku:
	@GIT_DIR=.heroku-git git init
	@GIT_DIR=.heroku-git git remote add heroku git@heroku.com:worldtimesched.git

deploy:
	@GIT_DIR=.heroku-git git add -f data/*.json
	@GIT_DIR=.heroku-git git add .
	@GIT_DIR=.heroku-git git commit -m "Deploy `date`"
	@git push heroku

.PHONY: init-heroku deploy
