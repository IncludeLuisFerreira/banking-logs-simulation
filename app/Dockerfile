FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

RUN mkdir -p /app/data /app/logs

EXPOSE 3000

CMD ["node", "app.js"]