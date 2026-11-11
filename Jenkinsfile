pipeline {
  agent any
  tools { nodejs 'node20' }

  options {
    timeout(time: 20, unit: 'MINUTES')
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }

  environment {
    // Dummy value: Prisma only needs it to exist for generate/validate.
    DATABASE_URL = 'postgresql://ci:ci@localhost:5432/ci'
    // Unique name per build so CI containers never mix with a developer's.
    COMPOSE_PROJECT_NAME = "ci-${BUILD_NUMBER}"
  }

  stages {
    stage('Prepare env file') {
      steps {
        sh 'if [ ! -f .env ] && [ -f .env.example ]; then cp .env.example .env; fi'
      }
    }

    stage('Fast checks') {
      parallel {
        stage('Backend') {
          steps {
            dir('backend') {
              sh 'npm ci'
              sh 'npx prisma generate'
              sh 'npx prisma validate'
              sh 'npm run lint --if-present'
              sh 'npm test --if-present'
            }
          }
        }
        stage('Frontend') {
          steps {
            dir('frontend') {
              sh 'npm ci'
              sh 'npm run lint --if-present'
              sh 'npm test --if-present'
            }
          }
        }
      }
    }

    stage('Build images') {
      steps { sh 'docker compose build' }
    }

    stage('Verify stack') {
      steps {
        sh 'docker compose up -d --wait --wait-timeout 120'
        sh 'docker compose ps'
      }
    }
  }

  post {
    always {
      sh 'docker compose logs --no-color --tail=100 || true'
      sh 'docker compose down -v --remove-orphans || true'
    }
    success { echo 'Green: safe to merge.' }
    failure { echo 'Red: read the first error in the log.' }
  }
}