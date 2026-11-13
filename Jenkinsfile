pipeline {
  agent any
  tools { nodejs 'node20' }

  options {
    timeout(time: 60, unit: 'MINUTES')
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }

  environment {
    // Dummy value: Prisma only needs it to exist for generate/validate.
    DATABASE_URL = 'postgresql://ci:ci@localhost:5432/ci'
    // Unique name per build so CI containers never mix with a developer's.
    COMPOSE_PROJECT_NAME = "ci-${BUILD_NUMBER}"
    COMPOSE_FILE = 'compose.ci.yaml'
    DOCKERHUB_USER = '67070084'
    TAG = "${BUILD_NUMBER}"
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
            }
          }
        }
        stage('Frontend') {
          steps {
            dir('frontend') {
              sh 'npm ci'
              catchError(buildResult: 'UNSTABLE', stageResult: 'UNSTABLE') {
                sh 'npm run lint --if-present'
              }
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
        sh 'docker compose up -d --wait --wait-timeout 180'
        sh 'docker compose ps'
      }
    }

    stage('Approve deploy') {
      when { branch 'main' }
        steps {
          timeout(time: 30, unit: 'MINUTES') {
          input message: 'Deploy this build to Docker Hub and run it?'
        }
      }
    }

  stage('Push images') {
    when { branch 'main' }
    steps {
      withCredentials([usernamePassword(credentialsId: 'dockerhub', usernameVariable: 'DH_USER', passwordVariable: 'DH_TOKEN')]) {
        sh 'echo "$DH_TOKEN" | docker login -u "$DH_USER" --password-stdin'
        sh '''
          docker build -f backend/Dockerfile.prod -t $DOCKERHUB_USER/pet-backend:$TAG -t $DOCKERHUB_USER/pet-backend:latest backend
          docker build -f frontend/Dockerfile.prod --build-arg NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1 -t $DOCKERHUB_USER/pet-frontend:$TAG -t $DOCKERHUB_USER/pet-frontend:latest frontend
          docker push $DOCKERHUB_USER/pet-backend:$TAG
          docker push $DOCKERHUB_USER/pet-backend:latest
          docker push $DOCKERHUB_USER/pet-frontend:$TAG
          docker push $DOCKERHUB_USER/pet-frontend:latest
        '''
      }
    }
  }
  
  stage('Deploy locally') {
    when { branch 'main' }
    environment {
      COMPOSE_FILE = 'compose.prod.yaml'
      COMPOSE_PROJECT_NAME = 'pet-prod'
      POSTGRES_USER = 'pet_user'
      POSTGRES_DB = 'pet_adoption_db'
      POSTGRES_PASSWORD = credentials('pet-postgres-password')
      JWT_SECRET = credentials('pet-jwt-secret')
    }
    steps {
      sh 'docker compose pull'
      sh 'docker compose up -d --wait --wait-timeout 180'
      sh 'docker compose ps'
    }
  }

    stage('API tests') {
      steps {
        sh 'docker compose exec -T backend npm run test:api'
      }
    }
  }

  post {
    always {
      sh 'docker compose logs --no-color --tail=100 || true'
      sh 'docker compose down -v --remove-orphans || true'
      sh 'docker logout || true'
    }
    success { echo 'Green: safe to merge.' }
    failure { echo 'Red: read the first error in the log.' }
  }
}