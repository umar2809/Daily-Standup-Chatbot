terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "ap-south-1"
}

resource "aws_security_group" "sg" {
  name        = "DailyStandup-Chatbot-sg"
  description = "Allow SSH, HTTP, HTTPS, App"

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 4000
    to_port     = 4000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_instance" "daily_standup" {
  ami                         = "ami-0a543f2c350664a74"
  instance_type               = "t3.medium"
  key_name                    = "Chatbot-Key"
  vpc_security_group_ids      = [aws_security_group.sg.id]
  associate_public_ip_address = true

  root_block_device {
    volume_size = 20
    volume_type = "gp2"
  }

  tags = {
    Name = "DailyStandup-Chatbot"
  }
}

output "public_ip" {
  value = aws_instance.daily_standup.public_ip
}
