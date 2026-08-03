# frozen_string_literal: true

class Api::V1::ConversationsController < Api::BaseController
  include Redisable

  LIMIT = 20

  before_action -> { doorkeeper_authorize! :read, :'read:statuses' }, only: :index
  before_action -> { doorkeeper_authorize! :write, :'write:conversations' }, except: :index
  before_action :require_user!
  before_action :set_conversation, except: :index
  after_action :insert_pagination_headers, only: :index

  def index
    @conversations = paginated_conversations
    render json: @conversations, each_serializer: REST::ConversationSerializer, relationships: StatusRelationshipsPresenter.new(@conversations.map(&:last_status), current_user&.account_id)
  end

  def read
    @conversation.update!(unread: false)
    render json: @conversation, serializer: REST::ConversationSerializer
  end

  def unread
    @conversation.update!(unread: true)
    render json: @conversation, serializer: REST::ConversationSerializer
  end

  def destroy
    @conversation.destroy!
    render_empty
  end

  def typing
    broadcast_typing! if throttle_typing?
    render_empty
  end

  private

  # Ephemeral, latency-sensitive presence signal: publish directly to each
  # recipient's direct streaming channel instead of enqueuing a worker.
  def broadcast_typing!
    payload = { event: 'conversation.typing', payload: { conversation_id: @conversation.conversation_id.to_s, account_id: current_account.id.to_s } }.to_json

    @conversation.participant_account_ids.each do |recipient_id|
      next if Block.exists?(account_id: recipient_id, target_account_id: current_account.id)
      next unless redis.exists?("subscribed:timeline:direct:#{recipient_id}")

      redis.publish("timeline:direct:#{recipient_id}", payload)
    end
  end

  # Debounce on the server too: at most one broadcast per sender/conversation
  # every few seconds, regardless of how often the client calls us.
  def throttle_typing?
    redis.set("typing:#{current_account.id}:#{@conversation.id}", 1, nx: true, ex: 3)
  end

  def set_conversation
    @conversation = AccountConversation.where(account: current_account).find(params[:id])
  end

  def paginated_conversations
    AccountConversation.where(account: current_account)
      .includes(
        account: [:account_stat, user: :role],
        last_status: [
          :media_attachments,
          :status_stat,
          :tags,
          {
            preview_cards_status: { preview_card: { author_account: [:account_stat, user: :role] } },
            active_mentions: :account,
            account: [:account_stat, user: :role],
          },
        ]
      )
      .to_a_paginated_by_id(limit_param(LIMIT), params_slice(:max_id, :since_id, :min_id))
  end

  def next_path
    api_v1_conversations_url pagination_params(max_id: pagination_max_id) if records_continue?
  end

  def prev_path
    api_v1_conversations_url pagination_params(min_id: pagination_since_id) unless @conversations.empty?
  end

  def pagination_max_id
    @conversations.last.last_status_id
  end

  def pagination_since_id
    @conversations.first.last_status_id
  end

  def records_continue?
    @conversations.size == limit_param(LIMIT)
  end
end
