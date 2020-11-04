#!/bin/bash

while getopts ":i:e:" opt; do
  case $opt in
    i) instance="$OPTARG"
    ;;
    e) env="$OPTARG"
    ;;
    \?) echo "Invalid option -$OPTARG" >&2
    exit
    ;;
  esac
done

INST_LEN=$(echo -n $instance | wc -m)
ENV_LEN=$(echo -n $env | wc -m)

if [[ $INST_LEN == 0 || $ENV_LEN == 0 ]]
then
  echo "Invalid parameters passed, must pass -i <instance_name> -e <environment>"
  exit
fi

echo Paste key, then press enter

read key

KEY_LEN=$(echo -n $key | wc -m)

if [[ $KEY_LEN = 0 ]]
then
  echo "Invalid key passed"
fi

KEY=$key pm2 start --only $instance --env $env