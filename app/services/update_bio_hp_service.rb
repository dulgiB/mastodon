# frozen_string_literal: true

# 자기소개 본문에 적힌 "현재/최대" 체력 표기의 현재 값만 바꾼다.
#
# 오른쪽 숫자가 최대 체력과 같은 표기만 체력으로 보고, 그런 표기가 정확히
# 하나일 때만 고친다. 날짜(10/23)나 다른 분수 표기를 잘못 잡지 않기 위해서다.
# 없거나 둘 이상이면 아무것도 바꾸지 않는다. "/" 주변 공백은 사용자가 쓴
# 그대로 둔다. 바꾼 결과가 글자 수 제한 등 검증에 걸리면 저장하지 않는다.
class UpdateBioHpService < BaseService
  def call(account, current_hp:, max_hp:)
    pattern = %r{(?<!\d)\d+(?=[[:blank:]]*/[[:blank:]]*#{max_hp}(?!\d))}
    matches = account.note.to_enum(:scan, pattern).map { Regexp.last_match }

    return :not_found if matches.empty?
    return :ambiguous if matches.size > 1

    match = matches.first
    return :unchanged if match[0] == current_hp.to_s

    note = account.note.dup
    note[match.begin(0)...match.end(0)] = current_hp.to_s
    return :invalid unless UpdateAccountService.new.call(account, { note: note })

    ActivityPub::UpdateDistributionWorker.perform_in(ActivityPub::UpdateDistributionWorker::DEBOUNCE_DELAY, account.id)
    :updated
  end
end
