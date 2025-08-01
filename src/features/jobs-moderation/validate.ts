import { Message, MessageType } from "discord.js";

import { getLastPostAge } from "./job-mod-helpers.js";

import { countLines } from "../../helpers/string.js";
import { extractEmoji } from "../../helpers/string.js";
import { parseContent } from "./parse-content.js";
import {
  JobPostValidator,
  POST_FAILURE_REASONS,
  PostFailures,
  PostType,
} from "../../types/jobs-moderation.js";

const validate = (posts: ReturnType<typeof parseContent>, message: Message) => {
  const errors: PostFailures[] = [];
  errors.push(...participation(posts, message));
  errors.push(...formatting(posts, message));
  errors.push(...links(posts, message));
  return errors;
};
export default validate;

const GAP = /\n\s*\n\s*\n/g;
export const formatting: JobPostValidator = (posts, message) => {
  // Handle missing tags;
  const tags = [
    ...posts
      .reduce((accum, { tags }) => {
        tags.forEach((t) => accum.add(t));
        return accum;
      }, new Set<string>())
      .values(),
  ];

  const isHiring = tags.includes(PostType.hiring);
  const isForHire = tags.includes(PostType.forHire);
  const hasTags = tags.length > 0 && (isHiring || isForHire);

  const errors: PostFailures[] = [];

  if (!hasTags) {
    errors.push({ type: POST_FAILURE_REASONS.missingType });
  }
  if (isHiring && isForHire) {
    errors.push({ type: POST_FAILURE_REASONS.inconsistentType });
  }

  if (isHiring) {
    return errors;
  }

  posts.forEach((post) => {
    // If > 1 in 150 chars is an emoji
    const emojiCount = extractEmoji(post.description).length;
    if (emojiCount / post.description.length > 1 / 30) {
      errors.push({ type: POST_FAILURE_REASONS.tooManyEmojis });
    }
    const lineCount = countLines(post.description.trim());
    const maxLines = isForHire ? 8 : 18;
    if (lineCount > maxLines) {
      errors.push({
        type: POST_FAILURE_REASONS.tooManyLines,
        overage: lineCount - maxLines,
      });
    }
    const maxChars = isForHire ? 350 : 1800;
    if (post.description.length > maxChars) {
      errors.push({
        type: POST_FAILURE_REASONS.tooLong,
        overage: post.description.length - maxChars,
      });
    }
    if (message.content.match(GAP)) {
      errors.push({ type: POST_FAILURE_REASONS.tooManyGaps });
    }
  });

  return errors;
};

export const participation: JobPostValidator = (posts, message) => {
  const { members: mentions } = message.mentions;
  if (
    // Is a reply
    message.type === MessageType.Reply ||
    // Mentions a user other than self
    (mentions?.size && !mentions.every((m) => m.id === message.author.id))
  ) {
    return [{ type: POST_FAILURE_REASONS.replyOrMention }];
  }

  // Handle posting too frequently
  const lastSent = getLastPostAge(message.author);
  if (lastSent < 7) {
    return [{ type: POST_FAILURE_REASONS.tooFrequent, lastSent }];
  }
  return [];
};

const urlRegex = /(https?):\/\/[^\s/$.?#].[^\s]*/g;
export const links: JobPostValidator<false> = (posts) => {
  const errors: PostFailures[] = [];
  posts.forEach(({ tags, description }) => {
    if (!tags.includes(PostType.hiring)) {
      return;
    }
    const urls = description.match(urlRegex);
    if (!urls) {
      errors.push({ type: POST_FAILURE_REASONS.linkRequired });
    }
  });

  return errors;
};
